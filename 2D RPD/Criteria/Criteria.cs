using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public enum ActionUponFailure
{
	PreventPlacement,
	RemoveThenPlace,
	RemoveThenPlaceSpecial
}

public class CriteriaFailureData
{
	public string failureReason;
	public ActionUponFailure actionUponFailure;
	/// <summary>
	/// Dictionary of all conflicting components.
	/// List of int represents the FDI ID of the tooth that has the conflicting component attached to it
	/// </summary>
	public Dictionary<RPDComponent, List<int>> conflictingComponents = new Dictionary<RPDComponent, List<int>>();

	public CriteriaFailureData() { }

	/// <summary>
	/// Generates failure data
	/// </summary>
	/// <param name="failureReason">Reason for failure</param>
	/// <param name="actionUponFailure">What to do upon failure</param>
	/// <param name="conflictingComponents">Conflicting components, RPDComponent and int ToothFDIID tuple params</param>
	public CriteriaFailureData (string failureReason, ActionUponFailure actionUponFailure, params System.Tuple<RPDComponent, List<int>>[] conflictingComponents)
	{
		this.failureReason = failureReason;
		this.actionUponFailure = actionUponFailure;

		if (conflictingComponents != null)
		{
			if (conflictingComponents.Length > 0)
			{
				foreach (System.Tuple<RPDComponent, List<int>> conflict in conflictingComponents)
				{
					this.conflictingComponents.Add(conflict.Item1, new List<int>(conflict.Item2));
				}
			}
		}
	}

	/// <summary>
	/// Combines failure data
	/// </summary>
	/// <param name="otherFailureData">Failure data to combine with</param>
	public void CombineWith(CriteriaFailureData otherFailureData)
	{
		//combine failure reasons
		failureReason = $"{failureReason} AND {otherFailureData.failureReason}";

		//if either failure results in preventing placement, we prevent placement across the board
		//else we just use the other action upon failure
		if (actionUponFailure == ActionUponFailure.PreventPlacement || otherFailureData.actionUponFailure == ActionUponFailure.PreventPlacement)
			actionUponFailure = ActionUponFailure.PreventPlacement;
		else
			actionUponFailure = ActionUponFailure.RemoveThenPlace;

		if (otherFailureData.conflictingComponents != null)
			//go through each of the other failure data's conflicts
			//check if a similar component conflict exists on this current entry
			//if there is, combine their tooth FDI ID entries, making sure that each tooth FDI ID is unique
			//if not, create a new entry and carry over their tooth FDI IDs
			foreach (KeyValuePair<RPDComponent, List<int>> otherDataConflictEntry in otherFailureData.conflictingComponents)
			{
				//check if an entry for the conflicting component already exists on the current conflicting components dict
				if (conflictingComponents.TryGetValue(otherDataConflictEntry.Key, out List<int> currentEntryConflictList))
				{
					//entry already exists

					//add all tooth FDI IDs that do not already exist on the current list
					foreach (int otherConflictedToothFDIID in otherDataConflictEntry.Value)
					{
						if (!currentEntryConflictList.Contains(otherConflictedToothFDIID))
							currentEntryConflictList.Add(otherConflictedToothFDIID);
					}
				}
				else
				{
					//entry does not already exist

					//add the entry
					conflictingComponents.Add(otherDataConflictEntry.Key, new List<int>(otherDataConflictEntry.Value));
				}
			}
	}
}

public abstract class Criteria : ScriptableObject
{
	public ActionUponFailure actionUponFailure;

	/// <summary>
	/// Assesses this criteria
	/// </summary>
	/// <param name="placementData">The relevant info related to placing this component</param>
	/// <param name="failureData">Out failure data</param>
	/// <returns>True if successful, false otherwise</returns>
	public abstract bool Assess(PlacementData placementData, out CriteriaFailureData failureData);
	
	/// <summary>
	/// Generates failure data
	/// </summary>
	/// <param name="failureReason">Reason for failure</param>
	/// <param name="actionUponFailure">What to do upon failure</param>
	/// <param name="conflictingComponents">Conflicting components, RPDComponent and int ToothFDIID tuple params</param>
	/// <returns></returns>
	protected CriteriaFailureData GenerateFailureData(string failureReason, ActionUponFailure actionUponFailure, params System.Tuple<RPDComponent, List<int>>[] conflictingComponents)
	{
		CriteriaFailureData failureData = new CriteriaFailureData(failureReason, actionUponFailure, conflictingComponents);

		return failureData;
	}
}
