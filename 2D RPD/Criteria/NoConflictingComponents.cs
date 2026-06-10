using System.Collections;
using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(menuName = "Criteria/No Conflicting Components", fileName = "No Conflicting Components Criteria")]
public class NoConflictingComponents : Criteria
{
	public bool stopPlacementIfComponentAlreadyExists = true;

	public RPDComponent[] conflictingComponents;

	public override bool Assess(PlacementData placementData, out CriteriaFailureData failureData)
	{
		failureData = null;

		GenericTooth currentTooth = DLLIntegration.instance.GetToothByIndex(placementData.selectedToothFDIIndex);

		bool noConflicts = true;

		foreach(RPDComponent rpdComponent in conflictingComponents)
		{
			if (rpdComponent == null)
				continue;

			PerformCheckAndHandleFailure(rpdComponent, ref failureData);
		}

		if (stopPlacementIfComponentAlreadyExists)
		{
			PerformCheckAndHandleFailure(placementData.component, ref failureData, true);
		}

		return noConflicts;



		void PerformCheckAndHandleFailure(RPDComponent rpdComponent, ref CriteriaFailureData _failureData, bool forcePreventPlacementOnFail = false)
		{
			foreach (RPD_2DComponent.componentType component in rpdComponent.rpdComponent)
			{
				if (currentTooth.HasComponent(component))
				{
					if (forcePreventPlacementOnFail)
					{
						_failureData = HandleFailureData(placementData, _failureData, rpdComponent, ActionUponFailure.PreventPlacement);
					}
					else
					{
						_failureData = HandleFailureData(placementData, _failureData, rpdComponent);
					}
					noConflicts = false;
				}
			}
		}
	}

	protected virtual CriteriaFailureData HandleFailureData(PlacementData placementData, CriteriaFailureData failureData, RPDComponent conflictingComponent)
	{
		if (failureData == null)
			failureData = new CriteriaFailureData() { actionUponFailure = actionUponFailure };

		if (!failureData.conflictingComponents.ContainsKey(conflictingComponent))
			failureData.conflictingComponents.Add(conflictingComponent, new List<int>());

		if (!failureData.conflictingComponents[conflictingComponent].Contains(placementData.selectedToothFDIIndex))
			failureData.conflictingComponents[conflictingComponent].Add(placementData.selectedToothFDIIndex);

		if (string.IsNullOrWhiteSpace(failureData.failureReason))
			failureData.failureReason = GenerateConflictingComponentFailureReason(conflictingComponent, placementData);
		else
			failureData.failureReason = $"{failureData.failureReason} AND {GenerateConflictingComponentFailureReason(conflictingComponent, placementData)}";

		return failureData;
	}

	CriteriaFailureData HandleFailureData(PlacementData placementData, CriteriaFailureData failureData, RPDComponent conflictingComponent, ActionUponFailure overrideAction)
	{
		CriteriaFailureData _failureData = HandleFailureData(placementData, failureData, conflictingComponent);

		_failureData.actionUponFailure = overrideAction;

		return _failureData;
	}

	protected string GenerateConflictingComponentFailureReason (RPDComponent conflictingComponent, PlacementData placementData)
	{
		return $"Conflicting component {conflictingComponent.name} on tooth FDI ID {placementData.selectedToothFDIIndex}.";
	}
}
