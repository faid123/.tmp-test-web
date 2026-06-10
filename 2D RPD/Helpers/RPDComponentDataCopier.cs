using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEditor;
using UnityEngine.UI;
using Constants;

#if UNITY_EDITOR
public class RPDComponentDataCopier : ScriptableWizard
{
	[MenuItem("2D RPD Helpers/RPD Component Data Copier")]
	static void CreateWizard()
	{
		ScriptableWizard.DisplayWizard<RPDComponentDataCopier>("Copy RPD Component Data", "Copy And Close Window", "Copy");
	}

	public RPDComponent sourceComponent;
	public RPDComponent destinationComponent;

	private void OnWizardUpdate()
	{
		isValid = sourceComponent != null && destinationComponent != null;
		errorString = GenerateErrorString();
	}

	string GenerateErrorString()
	{
		string result = "";

		if (!isValid)
			result = "Source Component and Destination Component must be filled in.";

		return result;
	}

	private void OnWizardCreate()
	{
		Copy();
	}

	private void OnWizardOtherButton()
	{
		Copy();
	}

	void Copy()
	{
		if (!isValid)
			return;

		destinationComponent.displayName = sourceComponent.displayName;

		destinationComponent.rpdComponent = new RPD_2DComponent.componentType[sourceComponent.rpdComponent.Length];
		for (int i = 0; i < sourceComponent.rpdComponent.Length; i++)
		{
			destinationComponent.rpdComponent[i] = sourceComponent.rpdComponent[i];
		}

		destinationComponent.criteria = new List<Criteria>(sourceComponent.criteria.Count);
		foreach (Criteria criteria in sourceComponent.criteria)
		{
			destinationComponent.criteria.Add(criteria);
		}

		destinationComponent.componentVisuals = System.ObjectExtensions.Copy(sourceComponent.componentVisuals);
	}
}
#endif