using System.Collections;
using System.Collections.Generic;
using UnityEngine;

public class UI_PlaceComponentViaButton : MonoBehaviour
{
	public int toothFDIID;
	public RPDComponent component;
	/// <summary>
	/// Handles placing of function, called by Button UI on editor
	/// </summary>
	public void PlaceComponent()
	{
		RPDManager.instance.PlaceComponent(component, toothFDIID, out CriteriaFailureData failureData);
	}
}
